/** The Learn panel demos by catalog name, and the phase of the ones that are not built yet. */
import {
  GradientExplorer,
  ImpulseResponse,
  LineProfile,
  NeighborhoodStepper,
  RankStepper,
} from "./widgets";
import { WeightViewer } from "./weights";

export const WIDGETS = {
  "neighborhood-stepper": { title: "Neighborhood stepper", component: NeighborhoodStepper },
  "impulse-response": { title: "Impulse response", component: ImpulseResponse },
  "rank-stepper": { title: "Rank stepper", component: RankStepper },
  "gradient-explorer": { title: "Gradient explorer", component: GradientExplorer },
  "line-profile": { title: "Line profile", component: LineProfile },
  "weight-viewer": { title: "Weight viewer", component: WeightViewer },
} as const;

/** The phase that brings each demo that is not built yet. */
export const LATER_DEMOS: Readonly<Record<string, string>> = {
  "frequency-explorer": "5e",
  "point-op-curve": "5f",
  "morphology-stepper": "5d",
  "stage-viewer": "5c",
  "iteration-viewer": "5e",
  "noise-lab": "5b",
};
