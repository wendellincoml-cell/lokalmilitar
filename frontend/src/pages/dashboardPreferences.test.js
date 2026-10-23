import { getVisibleDashboardGridPositions } from "./dashboardPreferences";

describe("getVisibleDashboardGridPositions", () => {
  it("compacts visible cards while preserving their configured order", () => {
    const positions = getVisibleDashboardGridPositions(
      ["first", "hidden", "third", "fourth", "fifth"],
      ["first", "hidden", "third", "fourth", "fifth"],
      {
        first: { row: 1, column: 1 },
        hidden: { row: 1, column: 2 },
        third: { row: 1, column: 3 },
        fourth: { row: 1, column: 4 },
        fifth: { row: 2, column: 1 },
      },
      { hidden: false },
    );

    expect(positions).toEqual({
      first: { row: 1, column: 1 },
      third: { row: 1, column: 2 },
      fourth: { row: 1, column: 3 },
      fifth: { row: 1, column: 4 },
    });
  });
});
