// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowJourney from './WorkflowJourney';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function step(key: string) {
  return container.querySelector<HTMLButtonElement>(`[data-workflow-step="${key}"]`);
}

describe('WorkflowJourney', () => {
  it('renders the five ordered stages of the job-hunting workflow', () => {
    act(() => root.render(<WorkflowJourney onNavigate={vi.fn()} onOnboardingAction={vi.fn()} />));

    expect(container.textContent).toContain('求职工作流');
    expect([...container.querySelectorAll('[data-workflow-step]')]).toHaveLength(5);
    expect(container.textContent).toContain('配置模型 API');
    expect(container.textContent).toContain('整理简历');
    expect(container.textContent).toContain('投递岗位');
    expect(container.textContent).toContain('应试准备');
    expect(container.textContent).toContain('Offer 决策');
  });

  it('routes setup stages through the typed onboarding actions', () => {
    const onOnboardingAction = vi.fn();
    act(() => root.render(<WorkflowJourney onNavigate={vi.fn()} onOnboardingAction={onOnboardingAction} />));

    act(() => step('configure_ai')?.click());
    expect(onOnboardingAction).toHaveBeenLastCalledWith('configure_ai');

    act(() => step('resume')?.click());
    expect(onOnboardingAction).toHaveBeenLastCalledWith('create_primary_resume');

    act(() => step('application')?.click());
    expect(onOnboardingAction).toHaveBeenLastCalledWith('create_first_application');
  });

  it('navigates to the interview and offer views for the later stages', () => {
    const onNavigate = vi.fn();
    act(() => root.render(<WorkflowJourney onNavigate={onNavigate} onOnboardingAction={vi.fn()} />));

    act(() => step('interview')?.click());
    expect(onNavigate).toHaveBeenLastCalledWith('interview');

    act(() => step('offer')?.click());
    expect(onNavigate).toHaveBeenLastCalledWith('offers');
  });
});
