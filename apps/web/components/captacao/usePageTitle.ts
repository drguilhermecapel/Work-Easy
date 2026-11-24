import { useEffect } from 'react';

/** Sets the tab title while the page is shown and puts the previous one back when it goes away. */
export const usePageTitle = (title: string): void => {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
};
