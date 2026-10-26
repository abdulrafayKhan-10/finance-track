"use client";

import { type FormEvent, startTransition, useActionState } from "react";

/**
 * Like `useActionState`, but submits from `onSubmit` so React does not reset
 * the form afterwards: when the server returns validation errors, everything
 * the user typed stays in place.
 */
export function useActionForm<S>(
  action: (state: Awaited<S>, formData: FormData) => S | Promise<S>,
  initial: Awaited<S>,
) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return [state, onSubmit, pending] as const;
}
