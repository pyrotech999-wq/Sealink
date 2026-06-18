import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

interface Props {
  lat: number;
  lng: number;
  windDirection?: number;
}

export default function MiniMap({
  lat,
  lng,
  windDirection = 0,
}: Props) {
  const windIcon = L.divIcon({
    className: "",
    html: `
      <div
        style="
          font-size:32px;
          color:#38bdf8;
          transform:rotate(${windDirection}deg);
          transform-origin:center;
        "
      >
        ▲
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={12}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      <Marker
        position={[lat, lng]}
        icon={windIcon}
      />
    </MapContainer>
  );
}