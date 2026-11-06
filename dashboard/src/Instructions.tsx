import { api } from "./api";
import { useLoad } from "./load";

export function Instructions() {
  const { data, error } = useLoad(api.getInstructions);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Agent instructions</h1>
          <p>
            The UnderCover Agent follows these instructions on every claim.
            They're read only.
          </p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <article className="panel instructions">{data.instructions}</article>
      )}
    </>
  );
}
