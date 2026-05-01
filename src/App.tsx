import { Poll } from "./Poll";
import { Admin } from "./Admin";
import { Results } from "./Results";
import { CaseStudy } from "./CaseStudy";
import { CaseStudySteps } from "./CaseStudySteps";
import { CaseStudySticky } from "./CaseStudySticky";

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <Admin />;
  if (path.startsWith("/results")) return <Results />;
  // More-specific case-study variant routes MUST match before the base path.
  if (path.startsWith("/case-study/steps")) return <CaseStudySteps />;
  if (path.startsWith("/case-study/sticky")) return <CaseStudySticky />;
  if (path.startsWith("/case-study")) return <CaseStudy />;
  return <Poll />;
}
