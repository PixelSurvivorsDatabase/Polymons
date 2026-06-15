const SETTINGS_KEY = "poly-studio:settings";
const TRAINING_SAMPLES_KEY = "poly-studio:polycode-training-samples";
const MAX_TRAINING_SAMPLES = 100;

export const defaultStudioSettings: StudioSettings = {
  autoSuggestEnabled: true,
  polyCodeTrainingEnabled: false,
};

export function loadStudioSettings(): StudioSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as
      Partial<StudioSettings>;
    return {
      autoSuggestEnabled:
        typeof stored.autoSuggestEnabled === "boolean"
          ? stored.autoSuggestEnabled
          : defaultStudioSettings.autoSuggestEnabled,
      polyCodeTrainingEnabled:
        typeof stored.polyCodeTrainingEnabled === "boolean"
          ? stored.polyCodeTrainingEnabled
          : defaultStudioSettings.polyCodeTrainingEnabled,
    };
  } catch {
    return defaultStudioSettings;
  }
}

export function saveStudioSettings(settings: StudioSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function queuePolyCodeTrainingSample(input: {
  language: StudioLanguage;
  scriptKind: StudioScript["kind"];
  source: string;
}): void {
  const source = input.source.trim();
  if (source.length < 24) return;

  try {
    const samples = JSON.parse(
      localStorage.getItem(TRAINING_SAMPLES_KEY) ?? "[]",
    ) as Array<{
      language: StudioLanguage;
      scriptKind: StudioScript["kind"];
      source: string;
      capturedAt: string;
    }>;
    if (
      samples.some(
        (sample) =>
          sample.language === input.language &&
          sample.scriptKind === input.scriptKind &&
          sample.source === source,
      )
    ) {
      return;
    }

    samples.push({
      language: input.language,
      scriptKind: input.scriptKind,
      source: source.slice(0, 12_000),
      capturedAt: new Date().toISOString(),
    });
    localStorage.setItem(
      TRAINING_SAMPLES_KEY,
      JSON.stringify(samples.slice(-MAX_TRAINING_SAMPLES)),
    );
  } catch {
    // Storage may be unavailable or full; editing should continue normally.
  }
}
