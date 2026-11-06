import type { Step } from "./api";
import { entries, label, pretty, state, type Entry } from "./steps";

function Action({ entry }: Readonly<{ entry: Entry }>) {
  const now = state(entry);
  const sent = entry.input === "{}" ? "" : pretty(entry.input);
  return (
    <li className={`action ${now}`}>
      <details>
        <summary>
          {label(entry)}
          {now === "working" && <span className="muted"> working</span>}
        </summary>
        {sent && <pre>{sent}</pre>}
        {entry.result !== undefined && <pre>{pretty(entry.result)}</pre>}
      </details>
    </li>
  );
}

export function Activity({ steps }: Readonly<{ steps: Step[] }>) {
  if (steps.length === 0) {
    return <p className="muted">The agent hasn't worked on this claim yet.</p>;
  }
  return (
    <ol className="activity">
      {entries(steps).map((entry) =>
        entry.kind === "message" ? (
          <li key={entry.id} className="note">
            {entry.input}
          </li>
        ) : (
          <Action key={entry.id} entry={entry} />
        ),
      )}
    </ol>
  );
}
