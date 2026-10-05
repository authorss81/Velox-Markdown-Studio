import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { PreviewFallback } from '../PreviewFallback';

afterEach(() => {
  vi.restoreAllMocks();
});

function Boom({ shouldThrow }: { shouldThrow: boolean }): React.ReactNode {
  if (shouldThrow) throw new Error('kaboom from render');
  return <p>rendered fine</p>;
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary label="Thing">
        <Boom shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('rendered fine')).toBeInTheDocument();
  });

  it('contains a render throw instead of unmounting the page', () => {
    // React logs the caught error; silence it so the suite output stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary label="Preview">
        <Boom shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Preview could not be displayed/)).toBeInTheDocument();
    expect(screen.getByText('kaboom from render')).toBeInTheDocument();
  });

  it('reports the failure to onError exactly once', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();

    render(
      <ErrorBoundary label="Preview" onError={onError}>
        <Boom shouldThrow />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('re-renders children after a reset when the cause clears', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // A boundary whose child can recover is the real-world case: the document
    // that broke the preview is then edited into something valid.
    function Harness() {
      const [broken, setBroken] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setBroken(false)}>
            fix document
          </button>
          <ErrorBoundary label="Preview">
            <Boom shouldThrow={broken} />
          </ErrorBoundary>
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Repairing the document alone is not enough; the boundary must also reset.
    await userEvent.click(screen.getByRole('button', { name: /fix document/ }));
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('rendered fine')).toBeInTheDocument();
  });

  it('supports a custom recovery fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSwitchToRaw = vi.fn();

    render(
      <ErrorBoundary
        label="Preview"
        fallback={(_error, reset) => (
          <PreviewFallback
            onSwitchToRaw={() => {
              onSwitchToRaw();
              reset();
            }}
            onRetry={reset}
          />
        )}
      >
        <Boom shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText(/could not be previewed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /open the editor/i }));
    expect(onSwitchToRaw).toHaveBeenCalledTimes(1);
  });

  it('keeps sibling state alive when only a child boundary fails', async () => {
    // This is the point of placing boundaries narrowly: the tab state lives in
    // the parent, so catching a preview failure must not discard it.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    function Shell() {
      const [draft, setDraft] = useState('unsaved work');
      return (
        <>
          <span data-testid="draft">{draft}</span>
          <button type="button" onClick={() => setDraft('changed')}>
            edit
          </button>
          <ErrorBoundary label="Preview">
            <Boom shouldThrow />
          </ErrorBoundary>
        </>
      );
    }

    render(<Shell />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // The parent is still mounted and interactive.
    expect(screen.getByTestId('draft')).toHaveTextContent('unsaved work');
    await userEvent.click(screen.getByRole('button', { name: 'edit' }));
    expect(screen.getByTestId('draft')).toHaveTextContent('changed');
  });
});

describe('PreviewFallback', () => {
  it('offers both a way into the editor and a retry', async () => {
    const onSwitchToRaw = vi.fn();
    const onRetry = vi.fn();
    render(<PreviewFallback onSwitchToRaw={onSwitchToRaw} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: /open the editor/i }));
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(onSwitchToRaw).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('reassures the user that their text is safe', () => {
    render(<PreviewFallback onSwitchToRaw={() => {}} onRetry={() => {}} />);
    expect(screen.getByText(/your text is safe/i)).toBeInTheDocument();
  });
});
