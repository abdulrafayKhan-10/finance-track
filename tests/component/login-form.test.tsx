import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/login-form";
import type { FormState } from "@/features/auth/actions";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("LoginForm", () => {
  it("renders labelled fields and a reset link", () => {
    render(<LoginForm action={async () => ({})} next="/" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("link", { name: /forgot/i })).toHaveAttribute("href", "/login/forgot");
  });

  it("submits the form data, including the next path, and shows a generic error", async () => {
    const action = vi.fn(async (_state: FormState, _formData: FormData) => ({
      error: "Email or password is incorrect.",
    }));
    render(<LoginForm action={action} next="/accounts" />);

    await userEvent.type(screen.getByLabelText("Email"), "me@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    const formData = action.mock.calls[0]?.[1];
    if (!formData) throw new Error("action was not called");
    expect(Object.fromEntries(formData)).toEqual({ email: "me@example.com", password: "secret", next: "/accounts" });
  });

  it("links field errors to their inputs", async () => {
    render(<LoginForm action={async () => ({ fieldErrors: { email: "Enter a valid email address." } })} next="/" />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const email = await screen.findByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Enter a valid email address.");
  });
});

describe("LoginForm after a failed attempt", () => {
  it("keeps the email address but clears the password", async () => {
    render(<LoginForm action={async () => ({ error: "Email or password is incorrect." })} next="/" />);
    await userEvent.type(screen.getByLabelText("Email"), "me@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByRole("alert");
    expect(screen.getByLabelText("Email")).toHaveValue("me@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
});
