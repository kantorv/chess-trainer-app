import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import AppThemeWithLang from "./AppThemeWithLang";
import ColorModeIconDropdown from "./ColorModeIconDropdown";

const renderToggle = () =>
  render(
    <AppThemeWithLang>
      <ColorModeIconDropdown />
    </AppThemeWithLang>,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("color mode toggle", () => {
  it("is labelled from the catalog, in the active language", async () => {
    renderToggle();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: i18n.t("nav.toggleColorMode") }),
      ).toBeInTheDocument(),
    );
  });

  it("switches the mode when clicked", async () => {
    renderToggle();
    const button = await screen.findByRole("button");

    await userEvent.click(button);

    // MUI persists the choice so a reload keeps it. Reading the store rather
    // than the icon is what actually pins down "persisted across reloads".
    await waitFor(() =>
      expect(localStorage.getItem("mui-mode")).toBeTruthy(),
    );
    const first = localStorage.getItem("mui-mode");

    await userEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(localStorage.getItem("mui-mode")).not.toBe(first),
    );
  });
});
