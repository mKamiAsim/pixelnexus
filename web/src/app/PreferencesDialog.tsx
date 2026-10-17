import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { DEFAULT_LIMITS } from "@/core/image/limits";
import { DEFAULT_HISTORY, useSettings } from "@/state/settings";
import { useUi } from "@/state/ui";
import { applyTheme, isThemeId, THEMES } from "@/styles/themes";

const MB = 1024 * 1024;

/** Settings that are remembered in this browser. */
export function PreferencesDialog() {
  const open = useUi((s) => s.dialog === "preferences");
  const setDialog = useUi((s) => s.setDialog);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const limits = useSettings((s) => s.limits);
  const setLimits = useSettings((s) => s.setLimits);
  const rulers = useSettings((s) => s.rulers);
  const history = useSettings((s) => s.history);
  const setHistory = useSettings((s) => s.setHistory);
  const toggleRulers = useSettings((s) => s.toggleRulers);
  const reset = useSettings((s) => s.reset);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "preferences" : null)}
      title="Preferences"
      description="These settings are saved in this browser only."
      footer={
        <>
          <Button variant="ghost" onClick={reset}>
            Restore defaults
          </Button>
          <Button variant="primary" onClick={() => setDialog(null)}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 p-4 text-sm">
        <section aria-labelledby="prefs-look" className="flex flex-col gap-2.5">
          <h3 id="prefs-look" className="text-xs font-semibold text-text-secondary">
            Appearance
          </h3>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-secondary">Theme</span>
            <Select
              label="Theme"
              value={theme}
              onChange={(value) => {
                if (!isThemeId(value)) return;
                applyTheme(value);
                setTheme(value);
              }}
              options={THEMES.map((t) => ({ value: t.id, label: t.name }))}
              className="w-40"
            />
          </div>
          <Switch label="Show rulers" checked={rulers} onChange={toggleRulers} />
        </section>
        <section aria-labelledby="prefs-limits" className="flex flex-col gap-2.5">
          <h3 id="prefs-limits" className="text-xs font-semibold text-text-secondary">
            Image limits
          </h3>
          <p className="text-xs text-text-secondary">
            Larger files are refused before they are decoded. This protects the browser from running
            out of memory. A 6000 x 6000 image has 36 million pixels.
          </p>
          <LimitRow
            label="Largest file"
            unit="MB"
            value={Math.round(limits.maxFileBytes / MB)}
            min={1}
            max={500}
            fallback={DEFAULT_LIMITS.maxFileBytes / MB}
            onChange={(value) => setLimits({ ...limits, maxFileBytes: value * MB })}
          />
          <LimitRow
            label="Most pixels"
            unit="million"
            value={Math.round(limits.maxPixels / 1e6)}
            min={1}
            max={250}
            fallback={DEFAULT_LIMITS.maxPixels / 1e6}
            onChange={(value) => setLimits({ ...limits, maxPixels: value * 1e6 })}
          />
          <LimitRow
            label="Longest side"
            unit="px"
            value={limits.maxSide}
            min={256}
            max={32768}
            fallback={DEFAULT_LIMITS.maxSide}
            onChange={(value) => setLimits({ ...limits, maxSide: value })}
          />
        </section>
        <section aria-labelledby="prefs-history" className="flex flex-col gap-2.5">
          <h3 id="prefs-history" className="text-xs font-semibold text-text-secondary">
            History
          </h3>
          <p className="text-xs text-text-secondary">
            Each image keeps this many steps after the original, within this much memory. When
            either is full, the oldest steps are dropped. The original always stays.
          </p>
          <LimitRow
            label="Steps"
            unit="steps"
            value={history.steps}
            min={5}
            max={500}
            fallback={DEFAULT_HISTORY.steps}
            onChange={(value) => setHistory({ ...history, steps: value })}
          />
          <LimitRow
            label="Memory"
            unit="MB"
            value={Math.round(history.megabytes)}
            min={64}
            max={8192}
            fallback={DEFAULT_HISTORY.megabytes}
            onChange={(value) => setHistory({ ...history, megabytes: value })}
          />
        </section>
      </div>
    </Dialog>
  );
}

function LimitRow({
  label,
  unit,
  value,
  min,
  max,
  fallback,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  fallback: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-text-secondary">
        {label}{" "}
        <span className="text-text-muted">(default {fallback.toLocaleString("en-US")})</span>
      </span>
      <NumberField
        label={`${label} in ${unit}`}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        integer
        unit={unit}
        className="w-32"
      />
    </div>
  );
}
