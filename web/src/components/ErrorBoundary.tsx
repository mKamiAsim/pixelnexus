import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";

interface Props {
  /** What failed, for the message, for example "the Inspector panel". */
  readonly name: string;
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

/**
 * Catches an error in one part of the studio and shows a message there, so the rest of the
 * studio keeps working.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Error in ${this.props.name}:`, error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-3 text-sm">
        <p className="font-medium text-text">Something went wrong in {this.props.name}.</p>
        <p className="text-xs break-words text-text-secondary">{error.message}</p>
        <Button size="sm" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    );
  }
}
