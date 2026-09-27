import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { jobberGraphQL } from "@/lib/jobber";
import { decryptToken } from "@/lib/secure-token";
import { createHash } from "node:crypto";

const JOBS_QUERY = `query GetJobs($cursor: String) {
  jobs(first: 10, after: $cursor) {
    nodes {
      id
      jobNumber
      title
      client {
        id
        name
        phone
      }
      property {
        id
        name
        address {
          street
          city
          postalCode
        }
      }
      visits(first: 10) {
        nodes {
          id
          title
          startAt
          endAt
          duration
          visitStatus
          assignedUsers(first: 3) {
            nodes {
              id
              name {
                full
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

function stableId(prefix: string, value: string) {
  return prefix + "-" + createHash("sha256").update(value).digest("hex").slice(0, 32);
}

type JobberJob = {
  id: string;
  jobNumber: number;
  title?: string | null;
  client: { id: string; name: string; phone?: string | null };
  property?: {
    id: string;
    name?: string | null;
    address?: {
      street?: string | null;
      city?: string | null;
      postalCode?: string | null;
    } | null;
  } | null;
  visits: {
    nodes: Array<{
      id: string;
      title?: string | null;
      startAt?: string | null;
      endAt?: string | null;
      duration?: number | null;
      visitStatus: string;
      assignedUsers?: {
        nodes: Array<{ id: string; name?: { full?: string | null } | null }>;
      } | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  };
};

export async function POST() {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();
    if (!userId || !companyId) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const { data: connection, error: connectionError } = await supabase
      .from("scheduling_connections")
      .select("external_account_id,encrypted_access_token,active")
      .eq("company_id", companyId)
      .eq("provider", "jobber")
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection?.active || !connection.encrypted_access_token) {
      return NextResponse.json({ ok: false, error: "Jobber is not connected" }, { status: 404 });
    }

    const jobs: JobberJob[] = [];
    let cursor: string | null = null;

    do {
      const result: {
        jobs: {
          nodes: JobberJob[];
          pageInfo: {
            hasNextPage: boolean;
            endCursor?: string | null;
          };
        };
      } = await jobberGraphQL(
        decryptToken(connection.encrypted_access_token),
        JOBS_QUERY,
        { cursor }
      );

      jobs.push(...result.jobs.nodes);
      cursor = result.jobs.pageInfo.hasNextPage ? result.jobs.pageInfo.endCursor ?? null : null;
    } while (cursor);

    const crewRows = new Map<string, { id: string; company_id: string; name: string; daily_capacity: number }>();
    const customerRows = new Map<string, { id: string; company_id: string; name: string; phone: string | null; address: string; preferred_days: string[] }>();
    const appointmentRows: Record<string, unknown>[] = [];

    for (const job of jobs) {
      const customerId = stableId(companyId + "-jobber-customer", job.client.id);
      const addressParts = [
        job.property?.address?.street,
        job.property?.address?.city,
        job.property?.address?.postalCode,
      ].filter(Boolean);

      for (const visit of job.visits.nodes) {
        if (!visit.startAt) continue;
        const scheduledDate = new Date(visit.startAt);
        if (Number.isNaN(scheduledDate.getTime())) continue;

        const assigned = visit.assignedUsers?.nodes ?? [];
        const crew = assigned[0];
        const crewId = crew
          ? stableId(companyId + "-jobber-crew", crew.id)
          : companyId + "-jobber-crew-unassigned";
        const crewName = crew?.name?.full || "Jobber Unassigned";

        crewRows.set(crewId, {
          id: crewId,
          company_id: companyId,
          name: crewName,
          daily_capacity: 480,
        });

        const preferredDay = scheduledDate.toLocaleDateString("en-US", {
          weekday: "short",
          timeZone: "America/New_York",
        });

        customerRows.set(customerId, {
          id: customerId,
          company_id: companyId,
          name: job.client.name,
          phone: job.client.phone ?? null,
          address: addressParts.join(", ") || job.property?.name || "Jobber property",
          preferred_days: [preferredDay],
        });

        appointmentRows.push({
          id: stableId(companyId + "-jobber-visit", visit.id),
          company_id: companyId,
          customer_id: customerId,
          crew_id: crewId,
          service: visit.title || job.title || `Job #${job.jobNumber}`,
          scheduled_date: scheduledDate.toISOString(),
          duration_minutes: visit.duration ?? 60,
          status: "SCHEDULED",
        });
      }
    }

    if (crewRows.size) {
      const { error } = await supabase
        .from("crews")
        .upsert([...crewRows.values()], { onConflict: "id" });
      if (error) throw error;
    }

    if (customerRows.size) {
      const { error } = await supabase
        .from("customers")
        .upsert([...customerRows.values()], { onConflict: "id" });
      if (error) throw error;
    }

    if (appointmentRows.length) {
      const { error } = await supabase
        .from("appointments")
        .upsert(appointmentRows, { onConflict: "id" });
      if (error) throw error;
    }

    return NextResponse.json({
      ok: true,
      jobs: jobs.length,
      appointments: appointmentRows.length,
      crews: crewRows.size,
      customers: customerRows.size,
    });
  } catch (error) {
    console.error("RainShift Jobber sync error", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Jobber sync failed" },
      { status: 500 }
    );
  }
}
