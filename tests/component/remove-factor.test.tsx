import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RemoveFactor } from "@/components/settings/remove-factor";

describe("RemoveFactor", () => {
  it("requires an explicit confirmation before calling the action", async () => {
    const action = vi.fn(async () => ({ success: "Two-factor authentication has been turned off." }));
    render(<RemoveFactor factorId="f-1" action={action} />);

    await userEvent.click(screen.getByRole("button", { name: /turn off two-factor/i }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(/stolen password alone/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/stolen password alone/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /turn off two-factor/i }));
    await userEvent.click(screen.getByRole("button", { name: /yes, turn it off/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("turned off");
    expect(action).toHaveBeenCalledTimes(1);
  });
});
