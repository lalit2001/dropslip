import QRCode from "qrcode";

export async function ShareQrCode({ url }: { url: string }) {
  const dataUrl = await QRCode.toDataURL(url, {
    width: 176,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt="QR code linking to this share"
      width={176}
      height={176}
      className="rounded-lg border border-black/[.08] dark:border-white/[.145]"
    />
  );
}
