import PublicUserProfile from "@/components/profile/public-user-profile"

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ walletAddress: string }>
}) {
  const { walletAddress } = await params
  return <PublicUserProfile walletAddress={walletAddress} />
}
