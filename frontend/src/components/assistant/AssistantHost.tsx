import { useAuth } from "../../auth/AuthContext";
import CandidateAssistant from "./CandidateAssistant";

export default function AssistantHost() {
  const { user, accessToken } = useAuth();
  const assistantKey = `${user?._id ?? "guest"}:${accessToken ?? "none"}`;

  return <CandidateAssistant key={assistantKey} />;
}
