import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExperienceCard from '../ExperienceCard';
import type { WalkingExperience } from '@/lib/walkingExperiences';

describe('ExperienceCard', () => {
  const mockExperience: WalkingExperience = {
    id: 'test-exp-1',
    track_name: 'Test Walking Track',
    url_to_webpage: 'https://example.com/track',
    url_to_thumbnail: 'https://example.com/thumb.jpg',
    location: 'Test Location',
    difficulty: 'Easy',
    duration: '2 hours',
    distance: '5km',
  };

  it('should render experience card with image and name', () => {
    const onRemove = vi.fn();
    render(<ExperienceCard experience={mockExperience} onRemove={onRemove} />);

    const nameLink = screen.getByText('Test Walking Track');
    expect(nameLink).toBeInTheDocument();
    expect(nameLink.closest('a')).toHaveAttribute('href', 'https://example.com/track');
    expect(nameLink.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('should render image as clickable link', () => {
    const onRemove = vi.fn();
    const { container } = render(<ExperienceCard experience={mockExperience} onRemove={onRemove} />);

    // Find the image link (first link containing the image)
    const imageLink = container.querySelector('a[href="https://example.com/track"] img');
    expect(imageLink).toBeInTheDocument();
    expect(imageLink?.closest('a')).toHaveAttribute('href', 'https://example.com/track');
    expect(imageLink?.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('should call onRemove when X button is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ExperienceCard experience={mockExperience} onRemove={onRemove} />);

    // The X button should be visible
    const removeButton = screen.getByRole('button', { name: /remove experience/i });
    expect(removeButton).toBeInTheDocument();

    await user.click(removeButton);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('should handle experience without thumbnail', () => {
    const experienceWithoutThumb: WalkingExperience = {
      ...mockExperience,
      url_to_thumbnail: null,
    };
    const onRemove = vi.fn();
    render(<ExperienceCard experience={experienceWithoutThumb} onRemove={onRemove} />);

    // Should still render the card
    expect(screen.getByText('Test Walking Track')).toBeInTheDocument();
  });

  it('should truncate long names with ellipsis', () => {
    const longNameExperience: WalkingExperience = {
      ...mockExperience,
      track_name: 'This is a very long track name that should be truncated with ellipsis when it exceeds two lines of text',
    };
    const onRemove = vi.fn();
    render(<ExperienceCard experience={longNameExperience} onRemove={onRemove} />);

    const nameElement = screen.getByText(longNameExperience.track_name);
    expect(nameElement).toHaveClass('line-clamp-2');
  });

  it('should not render remove button if onRemove is undefined', () => {
    render(<ExperienceCard experience={mockExperience} onRemove={undefined} />);

    const removeButton = screen.queryByRole('button', { name: /remove experience/i });
    expect(removeButton).not.toBeInTheDocument();
  });
});
