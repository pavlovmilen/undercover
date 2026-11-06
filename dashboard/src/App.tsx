import { api } from "./api";
import { ClaimPage } from "./ClaimPage";
import { Instructions } from "./Instructions";
import { useLoad } from "./load";
import { Queue } from "./Queue";
import { useRoute, type Route } from "./route";

function Page({ route }: Readonly<{ route: Route }>) {
  switch (route.page) {
    case "claim":
      return <ClaimPage key={route.claimId} claimId={route.claimId} />;
    case "instructions":
      return <Instructions />;
    default:
      return <Queue />;
  }
}

export function App() {
  const route = useRoute();
  const { data, error } = useLoad(api.health, 10000);
  let backend = data ? "up" : "checking";
  if (error) backend = "down";
  return (
    <div className="shell">
      <header className="masthead">
        <a className="wordmark" href="#/">
          UnderCover<em>Claims desk</em>
        </a>
        <nav aria-label="Main">
          <a
            href="#/"
            aria-current={route.page === "instructions" ? undefined : "page"}
          >
            Queue
          </a>
          <a
            href="#/instructions"
            aria-current={route.page === "instructions" ? "page" : undefined}
          >
            Agent instructions
          </a>
        </nav>
        <p className="backend">Backend: {backend}</p>
      </header>
      <main>
        <Page route={route} />
      </main>
    </div>
  );
}
