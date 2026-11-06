import { useCallback, useState } from "react";
import { api, type Claim, type Decision } from "./api";
import { DECISION_LABELS, money, moment } from "./format";
import { useLoad } from "./load";
import { Pill } from "./Pill";

function SignOff({
  claimId,
  onSignedOff,
}: Readonly<{ claimId: string; onSignedOff: () => void }>) {
  const { data: handlers } = useLoad(api.listHandlers);
  const [handlerId, setHandlerId] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const chosen =
    handlerId === "" ? (handlers?.at(0)?.handler_id ?? "") : handlerId;

  const signOff = useCallback(() => {
    setBusy(true);
    api.signOff(claimId, chosen).then(onSignedOff, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    });
  }, [claimId, chosen, onSignedOff]);

  return (
    <div className="sign-off">
      <label htmlFor="handler">Signing off as</label>
      <div className="sign-off-row">
        <select
          id="handler"
          value={chosen}
          onChange={(event) => {
            setHandlerId(event.target.value);
          }}
        >
          {handlers?.map((handler) => (
            <option key={handler.handler_id} value={handler.handler_id}>
              {handler.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={signOff} disabled={busy || !chosen}>
          Sign off and pay
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Payment({ decision }: Readonly<{ decision: Decision }>) {
  if (decision.paid_amount !== null && decision.paid_at) {
    return (
      <p className="payment">
        Paid {money(decision.paid_amount)} on {moment(decision.paid_at)}.
        {decision.signed_off_by && ` Signed off by ${decision.signed_off_by}.`}
      </p>
    );
  }
  return <p className="payment">Not paid.</p>;
}

export function DecisionPanel({
  claim,
  onChange,
}: Readonly<{ claim: Claim; onChange: () => void }>) {
  const { decision } = claim;
  if (!decision) {
    return (
      <section className="panel decision">
        <h2>Decision</h2>
        <p className="muted">
          No decision yet. Run the agent to decide this claim.
        </p>
      </section>
    );
  }
  const waiting = claim.status === "awaiting_sign_off";
  return (
    <section className="panel decision">
      <div className="decision-head">
        <h2>Decision</h2>
        <Pill tone={decision.decision}>
          {DECISION_LABELS[decision.decision]}
        </Pill>
      </div>
      <p className="payout mono">{money(decision.payout)}</p>
      <p>{decision.reasons}</p>
      <dl className="facts">
        <div>
          <dt>Policy section</dt>
          <dd>{decision.policy_section}</dd>
        </div>
        <div>
          <dt>Decided</dt>
          <dd>{moment(decision.decided_at)}</dd>
        </div>
      </dl>
      {decision.decision === "approve" && !waiting && (
        <Payment decision={decision} />
      )}
      {waiting && (
        <>
          <p className="payment held">
            Waiting for sign-off. Payouts over $1,000.00 are paid once a handler
            signs off.
          </p>
          <SignOff claimId={claim.claim_id} onSignedOff={onChange} />
        </>
      )}
    </section>
  );
}
