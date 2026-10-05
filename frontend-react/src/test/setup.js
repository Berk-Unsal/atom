import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

configure({ asyncUtilTimeout: 5_000 });

afterEach(cleanup);
