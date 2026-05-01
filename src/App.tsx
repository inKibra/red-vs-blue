import { Poll } from "./Poll";
import { Admin } from "./Admin";
import { Results } from "./Results";

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <Admin />;
  if (path.startsWith("/results")) return <Results />;
  return <Poll />;
}
