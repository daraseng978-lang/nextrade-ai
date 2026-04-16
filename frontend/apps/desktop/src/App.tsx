import { WorkstationProvider } from "./state/WorkstationContext";
import { DesktopLayout } from "./layout/DesktopLayout";

export function App() {
  return (
    <WorkstationProvider>
      <DesktopLayout />
    </WorkstationProvider>
  );
}
