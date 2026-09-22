import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from '../Hero';

describe('Hero Component', () => {
  it('should render without crashing', () => {
    render(<Hero />);
    // Hero uses a <section> element, check for heading instead
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
  });

  it('should display main heading', () => {
    render(<Hero />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent(/Compare smarter/i);
  });

  it('should display description text', () => {
    render(<Hero />);
    const description = screen.getByText(/Transparent comparisons/i);
    expect(description).toBeInTheDocument();
  });

  it('should have navigation links', () => {
    render(<Hero />);
    const startComparingLink = screen.getByRole('link', { name: /Start comparing/i });
    const exploreGuidesLink = screen.getByRole('link', { name: /Explore guides/i });
    
    expect(startComparingLink).toBeInTheDocument();
    expect(exploreGuidesLink).toBeInTheDocument();
  });
});
