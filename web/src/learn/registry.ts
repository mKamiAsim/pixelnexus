/** The Learn panel demos by catalog name, and the phase of the ones that are not built yet. */
import {
  GradientExplorer,
  ImpulseResponse,
  LineProfile,
  NeighborhoodStepper,
  RankStepper,
} from "./widgets";
import { MorphologyStepper } from "./morphology";
import { NoiseLab } from "./noiselab";
import { StageViewer } from "./stages";
import { WeightViewer } from "./weights";

export const WIDGETS = {
  "neighborhood-stepper": { title: "Neighborhood stepper", component: NeighborhoodStepper },
  "impulse-response": { title: "Impulse response", component: ImpulseResponse },
  "rank-stepper": { title: "Rank stepper", component: RankStepper },
  "gradient-explorer": { title: "Gradient explorer", component: GradientExplorer },
  "line-profile": { title: "Line profile", component: LineProfile },
  "weight-viewer": { title: "Weight viewer", component: WeightViewer },
  "noise-lab": { title: "Noise lab", component: NoiseLab },
  "stage-viewer": { title: "Stage viewer", component: StageViewer },
  "morphology-stepper": { title: "Morphology stepper", component: MorphologyStepper },
} as const;

/** The phase that brings each demo that is not built yet. */
export const LATER_DEMOS: Readonly<Record<string, string>> = {
  "frequency-explorer": "5e",
  "point-op-curve": "5f",
  "iteration-viewer": "5e",
};
