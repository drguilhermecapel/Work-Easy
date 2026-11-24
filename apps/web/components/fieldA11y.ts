import { ReactElement, ReactNode, cloneElement, isValidElement } from 'react';

type Describable = { 'aria-describedby'?: string; 'aria-invalid'?: boolean };

/**
 * Wires a form control to the hint and the error that Field renders next to it: the control is
 * read together with them (aria-describedby) and announces that it is invalid (aria-invalid).
 * Only a plain input, select or textarea is changed; any description the control already has is kept.
 */
export const describeControl = (children: ReactNode, ids: { hint?: string; error?: string }): ReactNode => {
  const added = [ids.hint, ids.error].filter((id): id is string => Boolean(id));
  if (
    added.length === 0 ||
    !isValidElement<Describable>(children) ||
    typeof children.type !== 'string' ||
    !['input', 'select', 'textarea'].includes(children.type)
  ) {
    return children;
  }
  const own = (children.props['aria-describedby'] ?? '').split(/\s+/).filter(Boolean);
  const describedBy = [...own, ...added.filter(id => !own.includes(id))].join(' ');
  return cloneElement(children as ReactElement<Describable>, {
    'aria-describedby': describedBy,
    ...(ids.error ? { 'aria-invalid': true } : {}),
  });
};
