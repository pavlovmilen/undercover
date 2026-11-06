import { api, type ClaimSummary } from "./api";
import {
  DECISION_LABELS,
  STATUSES,
  STATUS_LABELS,
  day,
  money,
  words,
} from "./format";
import { useLoad } from "./load";
import { Pill } from "./Pill";

function Flow({ claims }: Readonly<{ claims: ClaimSummary[] }>) {
  const counts = STATUSES.map((status) => ({
    status,
    count: claims.filter((claim) => claim.status === status).length,
  }));
  return (
    <section className="panel flow" aria-label="Where the claims stand">
      <div className="flow-bar" aria-hidden="true">
        {counts.map(({ status, count }) =>
          count ? (
            <span key={status} className={status} style={{ flexGrow: count }} />
          ) : null,
        )}
      </div>
      <dl className="flow-counts">
        {counts.map(({ status, count }) => (
          <div key={status} className={status}>
            <dt>{STATUS_LABELS[status]}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Row({ claim }: Readonly<{ claim: ClaimSummary }>) {
  const link = `#/claims/${claim.claim_id}`;
  return (
    <tr>
      <td className="mono">
        <a href={link}>{claim.claim_id}</a>
      </td>
      <td>
        {claim.customer_name}
        <span className="summary">{claim.summary}</span>
      </td>
      <td>{words(claim.claim_type)}</td>
      <td className="num mono">{money(claim.amount_claimed)}</td>
      <td className="mono">{day(claim.submitted_on)}</td>
      <td>
        <Pill tone={claim.status}>{STATUS_LABELS[claim.status]}</Pill>
      </td>
      <td>{claim.decision ? DECISION_LABELS[claim.decision] : ""}</td>
      <td className="num mono">
        {claim.payout === null ? "" : money(claim.payout)}
      </td>
    </tr>
  );
}

export function Queue() {
  const { data: claims, error } = useLoad(api.listClaims, 3000);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Claims queue</h1>
          <p>
            The UnderCover Agent works through these claims. Payouts over
            $1,000.00 wait for a handler to sign off.
          </p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {claims && (
        <>
          <Flow claims={claims} />
          <section className="panel table-wrap">
            <table className="queue">
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th className="num">Claimed</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Decision</th>
                  <th className="num">Payout</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <Row key={claim.claim_id} claim={claim} />
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
