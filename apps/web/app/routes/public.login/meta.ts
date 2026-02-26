import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
  return [
    { title: "Compass Login" },
    { name: "description", content: "Sign in to Compass with Microsoft Entra ID" }
  ];
};
