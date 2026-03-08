import { describe, expect, it } from "vitest";
import tailwindConfig from "../tailwind.config";
import routeConfig from "./routes";
import App, { Layout } from "./root";

describe("static route/config modules", () => {
  it("exports expected tailwind and route configuration", () => {
    expect(tailwindConfig.darkMode).toEqual(["class"]);
    expect(tailwindConfig.plugins).toHaveLength(1);
    expect(routeConfig).toHaveLength(4);
  });

  it("creates root layout and app route elements", () => {
    const layoutElement = Layout({
      children: "child"
    });
    const appElement = App();

    expect(layoutElement).toBeTruthy();
    expect(appElement).toBeTruthy();
  });
});
