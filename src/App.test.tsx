// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Nurj application shell', () => {
  it('renders the landing experience and enters the signal scan', async () => {
    render(<App />);
    expect(screen.getByText('Build the business.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /run my signal scan/i }));
    expect(await screen.findByText('How far has the business moved beyond your head?')).toBeTruthy();
  });

  it('completes guest onboarding and opens the command centre', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /run my signal scan/i }));

    const questions = [
      'How far has the business moved beyond your head?',
      'What does a normal month look like financially?',
      'What outcome would change the next 90 days?',
      'Where does the engine break most often?',
      'How much focused time can you protect weekly?',
    ];

    for (const question of questions) {
      await screen.findByText(question);
      fireEvent.click(screen.getAllByRole('button').find((button) => button.textContent?.includes('A'))!);
    }

    expect(await screen.findByRole('heading', { name: /your business is in its validation era/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /open my command centre/i }));
    expect(await screen.findByText(/highest-leverage move/i)).toBeTruthy();
  });
});
