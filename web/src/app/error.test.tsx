import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ErrorPage from "./error";

it("lets a reader retry the server request and quote its digest without exposing internal error text", () => {
  const retry = vi.fn();
  render(
    <ErrorPage
      {...{
        error: Object.assign(new Error("private-database-password"), { digest: "2288339371" }),
        reset: vi.fn(),
        retry,
      }}
    />,
  );
  expect(screen.getByText(/2288339371/)).toBeVisible();
  expect(screen.queryByText(/private-database/)).not.toBeInTheDocument();
  expect(screen.queryByText(/后端服务/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新载入" }));
  expect(retry).toHaveBeenCalledOnce();
});
