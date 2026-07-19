import { AppWorkspace } from "@/components/app-workspace";
import { samples } from "@/lib/samples";

export default function Home() {
  return <AppWorkspace samples={samples} />;
}
