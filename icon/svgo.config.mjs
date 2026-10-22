// Figma's viewport clips are redundant: every production path stays in bounds.
export default {
  multipass: true,
  floatPrecision: 5,
  plugins: [
    { name: "removeAttrs", params: { attrs: ["clip-path", "id"] } },
    {
      name: "preset-default",
      params: { overrides: {
        removeDesc: false,
        removeUnknownsAndDefaults: { keepRoleAttr: true },
      } },
    },
  ],
};
