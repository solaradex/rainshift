import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { jobberGraphQL } from "@/lib/jobber";
import { getJobberAccessToken } from "@/lib/jobber-tokens";

type GraphQLTypeRef = {
  kind: string;
  name?: string | null;
  ofType?: GraphQLTypeRef | null;
};

type MutationField = {
  name: string;
  args: Array<{ name: string; type: GraphQLTypeRef }>;
};

type InputField = {
  name: string;
  type: GraphQLTypeRef;
};

type InputType = {
  kind: string;
  name: string;
  inputFields?: InputField[] | null;
};

const MUTATION_SCHEMA_QUERY = `query RainShiftJobberMutationSchema {
  __schema {
    mutationType {
      fields {
        name
        args {
          name
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  }
}`;

function namedType(type: GraphQLTypeRef): string | null {
  let current: GraphQLTypeRef | undefined = type;
  while (current) {
    if (current.name) return current.name;
    current = current.ofType ?? undefined;
  }
  return null;
}

function unwrapType(type: GraphQLTypeRef) {
  const parts: string[] = [];
  let current: GraphQLTypeRef | undefined = type;

  while (current) {
    parts.push(
      current.kind === "NON_NULL"
        ? "!"
        : current.kind === "LIST"
          ? "[]"
          : current.name ?? current.kind
    );
    current = current.ofType ?? undefined;
  }

  return parts.reverse().join("");
}

function typeNamesFor(fields: MutationField[]) {
  return [
    ...new Set(
      fields.flatMap((field) =>
        field.args
          .map((arg) => namedType(arg.type))
          .filter((name): name is string => Boolean(name))
          .filter((name) => name.endsWith("Input"))
      )
    ),
  ].slice(0, 60);
}

function isRelevantMutation(name: string) {
  return /assign|crew|user|visit|appointment|schedule|routing/i.test(name);
}

async function runSchemaQuery<T>(
  accessToken: string,
  query: string
): Promise<T> {
  return jobberGraphQL<T>(accessToken, query);
}

export async function GET() {
  try {
    const currentCompany = await getCurrentCompany();
    const supabase = currentCompany.supabase;
    const companyId = currentCompany.companyId;

    const { data: connection, error } = await supabase
      .from("scheduling_connections")
      .select(
        "id,encrypted_access_token,encrypted_refresh_token,active,access_token_expires_at"
      )
      .eq("company_id", companyId)
      .eq("provider", "jobber")
      .maybeSingle();

    if (error) throw error;

    if (!connection?.active || !connection.encrypted_access_token) {
      return NextResponse.json(
        { ok: false, error: "Jobber is not connected" },
        { status: 404 }
      );
    }

    let accessToken = await getJobberAccessToken(
      supabase,
      companyId,
      connection,
      false
    );

    const execute = () =>
      runSchemaQuery<{
        __schema: {
          mutationType: { fields: MutationField[] } | null;
        };
      }>(accessToken, MUTATION_SCHEMA_QUERY);

    let schema: {
      __schema: { mutationType: { fields: MutationField[] } | null };
    };

    try {
      schema = await execute();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("[HTTP 401]") && !message.includes("Access token expired")) {
        throw error;
      }

      accessToken = await getJobberAccessToken(
        supabase,
        companyId,
        connection,
        true
      );
      schema = await execute();
    }

    const mutations = schema.__schema.mutationType?.fields ?? [];
    const relevantMutations = mutations.filter((field) =>
      isRelevantMutation(field.name)
    );
    const inputTypeNames = typeNamesFor(relevantMutations);

    let inputTypes: Record<string, InputType | null> = {};

    if (inputTypeNames.length) {
      const aliases = inputTypeNames
        .map(
          (name, index) =>
            `t${index}: __type(name: ${JSON.stringify(name)}) {
              kind
              name
              inputFields {
                name
                type {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                    }
                  }
                }
              }
            }`
        )
        .join("\n");

      const inputSchema = await runSchemaQuery<Record<string, InputType | null>>(
        accessToken,
        `query RainShiftJobberInputTypes {\n${aliases}\n}`
      );

      inputTypes = Object.fromEntries(
        inputTypeNames.map((name, index) => [name, inputSchema[`t${index}`] ?? null])
      );
    }

    return NextResponse.json({
      ok: true,
      apiVersion: process.env.JOBBER_API_VERSION || "2026-05-12",
      mutationCount: mutations.length,
      relevantMutations: relevantMutations.map((field) => ({
        name: field.name,
        args: field.args.map((arg) => ({
          name: arg.name,
          type: unwrapType(arg.type),
          namedType: namedType(arg.type),
        })),
      })),
      relevantInputTypes: Object.fromEntries(
        Object.entries(inputTypes).map(([name, type]) => [
          name,
          type
            ? {
                kind: type.kind,
                fields:
                  type.inputFields?.map((field) => ({
                    name: field.name,
                    type: unwrapType(field.type),
                    namedType: namedType(field.type),
                  })) ?? [],
              }
            : null,
        ])
      ),
      nextStep:
        relevantMutations.length > 0
          ? "Use the mutation and input fields above to identify the exact Jobber crew-assignment mutation before adding it to the approval path."
          : "Jobber did not expose assignment-related mutations through introspection. Check the full schema in Jobber GraphiQL or contact Jobber developer support.",
    });
  } catch (error) {
    console.error("RainShift Jobber schema check error", error);
    const message =
      error instanceof Error ? error.message : "Jobber schema check failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
