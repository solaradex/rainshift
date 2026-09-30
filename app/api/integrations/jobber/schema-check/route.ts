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

function unwrapType(type: GraphQLTypeRef): string {
  const parts: string[] = [];
  let current: GraphQLTypeRef | undefined = type;

  while (current) {
    if (current.kind === "NON_NULL") parts.push("!");
    else if (current.kind === "LIST") parts.push("[]");
    else parts.push(current.name ?? current.kind);
    current = current.ofType ?? undefined;
  }

  return parts.reverse().join("");
}

function isRelevantMutation(name: string): boolean {
  return /assign|crew|user|visit|appointment|schedule|routing/i.test(name);
}

export async function GET() {
  try {
    const currentCompany = await getCurrentCompany();

    if (!currentCompany.companyId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { supabase, companyId } = currentCompany;

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
      jobberGraphQL<{
        __schema: {
          mutationType: { fields: MutationField[] } | null;
        };
      }>(accessToken, MUTATION_SCHEMA_QUERY);

    let schema;

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
    const relevantMutations = mutations
      .filter((field) => isRelevantMutation(field.name))
      .map((field) => ({
        name: field.name,
        args: field.args.map((arg) => ({
          name: arg.name,
          type: unwrapType(arg.type),
          namedType: namedType(arg.type),
        })),
      }));

    return NextResponse.json({
      ok: true,
      apiVersion: process.env.JOBBER_API_VERSION || "2026-05-12",
      mutationCount: mutations.length,
      relevantMutations,
      nextStep:
        relevantMutations.length > 0
          ? "Use these exact mutation names and argument/input types to add verified crew reassignment support."
          : "No assignment-related mutation was exposed by Jobber introspection. Check the full Jobber schema or developer support.",
    });
  } catch (error) {
    console.error("RainShift Jobber schema check error", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Jobber schema check failed",
      },
      { status: 500 }
    );
  }
}
