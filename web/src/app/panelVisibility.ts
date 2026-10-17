/**
 * Whether the panel around a component is showing (PLAN.md Phase 8 performance pass). A panel
 * in a tab group stays mounted while another tab is in front. Panels with heavy work, such as
 * Metrics, wait until they show. Outside the workspace, for example in tests, it is true.
 */
import { createContext, useContext } from "react";

export const PanelVisibleContext = createContext(true);

export const usePanelVisible = () => useContext(PanelVisibleContext);
