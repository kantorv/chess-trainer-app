import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTheme } from "@mui/material/styles";
import i18n from "../i18n";
import AppThemeWithLang from "./AppThemeWithLang";
import LanguageSwitch from "./LanguageSwitch";
import { ForceLTR } from "./ForceLTR";

function DirectionProbe() {
  const theme = useTheme();
  return <span data-testid="direction">{theme.direction}</span>;
}

/** Reads a string the MUI locale bundle supplies, to prove the bundle swapped. */
function LocaleProbe() {
  const theme = useTheme();
  return (
    <span data-testid="locale">
      {theme.components?.MuiTablePagination?.defaultProps?.labelRowsPerPage ??
        "none"}
    </span>
  );
}

const renderThemed = (children: ReactNode) =>
  render(<AppThemeWithLang>{children}</AppThemeWithLang>);

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("direction derived from the active language", () => {
  it("is ltr for English", () => {
    renderThemed(<DirectionProbe />);
    expect(screen.getByTestId("direction")).toHaveTextContent("ltr");
  });

  it("is rtl for Hebrew", async () => {
    await i18n.changeLanguage("he");
    renderThemed(<DirectionProbe />);
    expect(screen.getByTestId("direction")).toHaveTextContent("rtl");
  });

  it("follows a language change without a remount", async () => {
    renderThemed(<DirectionProbe />);
    expect(screen.getByTestId("direction")).toHaveTextContent("ltr");

    await i18n.changeLanguage("he");
    await waitFor(() =>
      expect(screen.getByTestId("direction")).toHaveTextContent("rtl"),
    );
  });

  it("falls back to ltr for a language this app does not ship", async () => {
    // An unknown tag must not leave direction undefined.
    await i18n.changeLanguage("fr");
    renderThemed(<DirectionProbe />);
    expect(screen.getByTestId("direction")).toHaveTextContent("ltr");
  });
});

describe("MUI locale bundle", () => {
  it("swaps together with the direction, not separately", async () => {
    // `enUS` is an empty object — English is MUI's own default, so an unset
    // override is what "the English bundle is active" looks like.
    renderThemed(<LocaleProbe />);
    expect(screen.getByTestId("locale")).toHaveTextContent("none");

    await i18n.changeLanguage("he");
    await waitFor(() =>
      expect(screen.getByTestId("locale")).toHaveTextContent("שורות בעמוד:"),
    );
  });
});

describe("document attributes", () => {
  it("sets dir and lang on the document for Hebrew", async () => {
    await i18n.changeLanguage("he");
    renderThemed(<DirectionProbe />);

    await waitFor(() => {
      expect(document.documentElement.dir).toBe("rtl");
      expect(document.body.dir).toBe("rtl");
      expect(document.documentElement.lang).toBe("he");
    });
  });

  it("returns them to ltr/en when the language switches back", async () => {
    await i18n.changeLanguage("he");
    renderThemed(<DirectionProbe />);
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));

    await i18n.changeLanguage("en");
    await waitFor(() => {
      expect(document.documentElement.dir).toBe("ltr");
      expect(document.documentElement.lang).toBe("en");
    });
  });
});

describe("ForceLTR", () => {
  it("pins its subtree to ltr while the shell is rtl", async () => {
    await i18n.changeLanguage("he");
    const { container } = renderThemed(
      <>
        <DirectionProbe />
        <ForceLTR>
          <span data-testid="pinned">board</span>
        </ForceLTR>
      </>,
    );

    // The shell mirrors...
    expect(screen.getByTestId("direction")).toHaveTextContent("rtl");
    // ...but the pinned subtree does not. This is what keeps a1 bottom-left.
    expect(container.querySelector('[dir="ltr"]')).toContainElement(
      screen.getByTestId("pinned"),
    );
  });
});

describe("LanguageSwitch", () => {
  it("shows the language currently in use", () => {
    renderThemed(<LanguageSwitch />);
    expect(screen.getByRole("combobox")).toHaveTextContent("English");
  });

  it("changes the language when a different one is picked", async () => {
    renderThemed(<LanguageSwitch />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "עברית" }));

    await waitFor(() => expect(i18n.language).toBe("he"));
  });
});
