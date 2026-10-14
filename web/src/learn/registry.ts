/** The Learn panel demos by catalog name, and the phase of the ones that are not built yet. */
import {
  GradientExplorer,
  ImpulseResponse,
  LineProfile,
  NeighborhoodStepper,
  RankStepper,
} from "./widgets";
import { FrequencyExplorer } from "./frequency";
import { IterationViewer } from "./iterations";
import { MorphologyStepper } from "./morphology";
import { NoiseLab } from "./noiselab";
import { PointOpCurve } from "./pointop";
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
  "frequency-explorer": { title: "Frequency explorer", component: FrequencyExplorer },
  "iteration-viewer": { title: "Iteration viewer", component: IterationViewer },
  "point-op-curve": { title: "Point-op curve", component: PointOpCurve },
} as const;

/** The phase that brings each demo that is not built yet. */
export const LATER_DEMOS: Readonly<Record<string, string>> = {};
