import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../utils";
import ComponentsPage from "@/views/ComponentsPage";

vi.mock('@/services/api', () => ({
  api: {
    components: {
      categories: vi.fn().mockResolvedValue([
        { label: "Weapons", slug: "weapons", types: ["WeaponGun"] },
        { label: "Liveries", slug: "liveries", types: ["Paint", "Livery"] },
      ]),
      filters: vi.fn().mockResolvedValue({
        types: ["Weapons", "Shields"],
        sub_types: [],
        sizes: ["1"],
        grades: ["A"],
        componentClasses: [{ value: "Civilian", label: "Civilian" }],
        bespoke: [
          { value: "false", label: "Universal" },
          { value: "true", label: "Bespoke" },
        ],
        manufacturers: [{ value: "behring", label: "Behring" }],
      }),
      list: vi.fn().mockResolvedValue({
        data: [{ uuid: "c1", name: "S1 Ballistic Gatling", type: "Weapons", size: 1 }],
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      }),
    },
  },
}));

describe('ComponentsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Components heading', async () => {
    renderWithProviders(<ComponentsPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /components/i })).toBeInTheDocument());
  });

  it('renders component name from API', async () => {
    renderWithProviders(<ComponentsPage />);
    await waitFor(() => expect(screen.getByText('S1 Ballistic Gatling')).toBeInTheDocument());
  });

  it("adapte les filtres visibles pour les liveries", async () => {
    renderWithProviders(<ComponentsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Liveries" }));

    expect(screen.getByRole("combobox", { name: "" })).toHaveTextContent("All manufacturers");
    expect(screen.getByText("Behring")).toBeInTheDocument();
    expect(screen.queryByText("All damage")).not.toBeInTheDocument();
    expect(screen.queryByText("All grades")).not.toBeInTheDocument();
    expect(screen.queryByText("All classes")).not.toBeInTheDocument();
    expect(screen.queryByText("All fitment")).not.toBeInTheDocument();
  });
});
