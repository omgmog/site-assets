import postcssImport from "postcss-import";
import postcssPresetEnv from "postcss-preset-env";
import cssnano from "cssnano";

export default {
  plugins: [postcssImport(), postcssPresetEnv({ stage: 2 }), cssnano()],
};
