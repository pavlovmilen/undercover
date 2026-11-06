import { useCallback, useState } from "react";
import { api, type Claim } from "./api";
import { Activity } from "./Activity";
import { DecisionPanel } from "./DecisionPanel";
import { STATUS_LABELS, day, money, words } from "./format";
import { useLoad } from "./load";
import { Pill } from "./Pill";

function Story({ claim }: Readonly<{ claim: Claim }>) {
  return (
    <section className="panel">
      <h2>What the customer told us</h2>
      <blockquote>{claim.story}</blockquote>
      <table className="items">
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {claim.items.map((item) => (
            <tr key={item.description}>
              <td>{item.description}</td>
              <td>{words(item.category)}</td>
              <td className="num mono">{money(item.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2}>Total claimed</th>
            <td className="num mono">{money(claim.amount_claimed)}</td>
          </tr>
        </tfoot>
      </table>
      <h3>Documents</h3>
      <ul className="documents">
        {claim.documents.map((document) => (
          <li key={document.name}>
            <strong>{document.name}</strong>
            <span className="muted"> {words(document.type)}</span>
            <p>{document.content}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PolicyPanel({ policyId }: Readonly<{ policyId: string }>) {
  const load = useCallback(() => api.getPolicy(policyId), [policyId]);
  const { data: policy } = useLoad(load);
  if (!policy) return null;
  return (
    <section className="panel">
      <h2>Policy</h2>
      <dl className="facts">
        <div>
          <dt>Plan</dt>
          <dd>{words(policy.plan)}</dd>
        </div>
        <div>
          <dt>Add-ons</dt>
          <dd>
            {policy.add_ons.length
              ? policy.add_ons.map(words).join(", ")
              : "None"}
          </dd>
        </div>
        <div>
          <dt>Trip</dt>
          <dd>
            {policy.trip.destination}, {day(policy.trip.departs_on)} to{" "}
            {day(policy.trip.returns_on)}
          </dd>
        </div>
        <div>
          <dt>Trip cost</dt>
          <dd className="mono">{money(policy.trip.trip_cost)}</dd>
        </div>
        <div>
          <dt>Travelers</dt>
          <dd>{policy.travelers.join(", ")}</dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd className="mono">{policy.policy_id}</dd>
        </div>
      </dl>
    </section>
  );
}

function History({ customerId }: Readonly<{ customerId: string }>) {
  const load = useCallback(() => api.getCustomer(customerId), [customerId]);
  const { data: customer } = useLoad(load);
  if (!customer) return null;
  return (
    <section className="panel">
      <h2>Claim history</h2>
      <p className="muted">
        {customer.name}, a customer since {day(customer.customer_since)}.
      </p>
      {customer.previous_claims.length === 0 ? (
        <p>No earlier claims.</p>
      ) : (
        <ul className="history">
          {customer.previous_claims.map((previous) => (
            <li key={previous.claim_id}>
              <span className="mono">{previous.claim_id}</span>{" "}
              {previous.summary}
              <span className="muted">
                {" "}
                Filed {day(previous.filed_on)}, {previous.outcome}, paid{" "}
                {money(previous.amount_paid)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ClaimPage({ claimId }: Readonly<{ claimId: string }>) {
  const loadClaim = useCallback(() => api.getClaim(claimId), [claimId]);
  const loadSteps = useCallback(() => api.listSteps(claimId), [claimId]);
  const claim = useLoad(loadClaim, 2000);
  const steps = useLoad(loadSteps, 2000);
  const [started, setStarted] = useState(false);
  const [runError, setRunError] = useState<string>();

  const { data } = claim;
  if (claim.error && !data) return <p className="error">{claim.error}</p>;
  if (!data) return <p className="muted">Loading {claimId}</p>;

  const open = data.status === "waiting" || data.status === "in_progress";
  const working =
    data.status === "in_progress" || (started && data.status === "waiting");
  const run = () => {
    setRunError(undefined);
    api.runAgent(claimId).then(
      () => {
        setStarted(true);
        claim.reload();
      },
      (reason: unknown) => {
        setRunError(reason instanceof Error ? reason.message : String(reason));
      },
    );
  };
  const reload = () => {
    claim.reload();
    steps.reload();
  };

  return (
    <>
      <a href="#/">Back to the queue</a>
      <div className="page-head claim-head">
        <div>
          <h1>{data.summary}</h1>
          <p>
            {words(data.claim_type)} claim{" "}
            <span className="mono">{data.claim_id}</span>{" "}
            <Pill tone={data.status}>{STATUS_LABELS[data.status]}</Pill>
          </p>
        </div>
        {open && (
          <button type="button" onClick={run} disabled={working}>
            {working ? "The agent is working" : "Run the agent"}
          </button>
        )}
      </div>
      {runError && <p className="error">{runError}</p>}
      <dl className="facts summary-facts">
        <div>
          <dt>Claimed</dt>
          <dd className="mono">{money(data.amount_claimed)}</dd>
        </div>
        <div>
          <dt>Incident</dt>
          <dd>
            {day(data.incident_date)}, {data.incident_location}
          </dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{day(data.submitted_on)}</dd>
        </div>
      </dl>
      <div className="claim-grid">
        <div className="stack">
          <Story claim={data} />
          <PolicyPanel policyId={data.policy_id} />
          <History customerId={data.customer_id} />
        </div>
        <div className="stack">
          <DecisionPanel claim={data} onChange={reload} />
          <section className="panel">
            <h2>Agent activity</h2>
            <Activity steps={steps.data ?? []} />
          </section>
        </div>
      </div>
    </>
  );
}
