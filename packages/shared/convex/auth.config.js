function getClerkIssuerDomain() {
  return (
    process.env.CLERK_JWT_ISSUER_DOMAIN ?? process.env.CLERK_FRONTEND_API_URL
  )?.replace(/\$$/, "");
}

export default {
  providers: [
    {
      domain: getClerkIssuerDomain(),
      applicationID: "convex",
    },
  ],
};
