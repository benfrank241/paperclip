import type { AgentRunner, AgentRunnerChoice } from "@paperclipai/shared";
import { Field } from "./agent-config-primitives";
import { SelectPopover } from "./ui/select";

/** The override is request-level. Automatic selection is resolved by the server. */
export function CodexRunnerSelect({
  value,
  onChange,
  defaultRunner = "legacy",
  supportedRunners = ["legacy"],
  disabled,
}: {
  value: AgentRunnerChoice;
  onChange: (value: AgentRunnerChoice) => void;
  defaultRunner?: AgentRunner;
  supportedRunners?: readonly AgentRunner[];
  disabled?: boolean;
}) {
  return (
    <Field label="Runner">
      <SelectPopover
        aria-label="Runner"
        disabled={disabled}
        value={value === "auto" ? defaultRunner : value}
        onValueChange={next => onChange(next as AgentRunnerChoice)}
        options={[
          { value: "paperclip", label: `Paperclip Runner${defaultRunner === "paperclip" ? " (default)" : ""}`, disabled: !supportedRunners.includes("paperclip") && value !== "paperclip" },
          { value: "legacy", label: `Legacy runner${defaultRunner === "legacy" ? " (default)" : ""}`, disabled: !supportedRunners.includes("legacy") && value !== "legacy" },
        ]}
      />
    </Field>
  );
}
