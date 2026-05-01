import { Poll } from "./Poll";
import { Admin } from "./Admin";
import { Results } from "./Results";
import { CaseStudy } from "./CaseStudy";

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <Admin />;
  if (path.startsWith("/results")) return <Results />;
  if (path.startsWith("/case-study")) return <CaseStudy />;
  return <Poll />;
}
