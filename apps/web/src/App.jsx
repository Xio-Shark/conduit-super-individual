import React from "react";
import { ConsoleLayout } from "./components/ConsoleShell.jsx";
import { useConsoleController } from "./useConsoleController.js";

export function App() {
  const { actions, consoleState } = useConsoleController();

  return <ConsoleLayout actions={actions} consoleState={consoleState} />;
}
