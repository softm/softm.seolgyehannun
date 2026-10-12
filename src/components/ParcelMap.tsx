import { useEffect, useRef } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { fromLonLat, toLonLat } from "ol/proj";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";
import type { CaseRecord, ParcelSnapshot } from "../types";

interface ParcelMapProps {
  cases?: CaseRecord[];
  parcels?: ParcelSnapshot[];
  selectedCaseId?: string | null;
  interactive?: boolean;
  onMapClick?: (longitude: number, latitude: number) => void;
  onCaseSelect?: (caseId: string) => void;
}

const EMPTY_CASES: CaseRecord[] = [];
const EMPTY_PARCELS: ParcelSnapshot[] = [];

export function ParcelMap({
  cases = EMPTY_CASES,
  parcels = EMPTY_PARCELS,
  selectedCaseId,
  interactive = false,
  onMapClick,
  onCaseSelect,
}: ParcelMapProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef(new VectorSource());
  const selectedCaseIdRef = useRef(selectedCaseId);
  const interactiveRef = useRef(interactive);
  const onMapClickRef = useRef(onMapClick);
  const onCaseSelectRef = useRef(onCaseSelect);
  selectedCaseIdRef.current = selectedCaseId;
  interactiveRef.current = interactive;
  onMapClickRef.current = onMapClick;
  onCaseSelectRef.current = onCaseSelect;

  useEffect(() => {
    if (!targetRef.current || mapRef.current) return;
    const vectorLayer = new VectorLayer({
      source: vectorSourceRef.current,
      style: (feature) => {
        const selected = feature.get("caseId") === selectedCaseIdRef.current;
        return new Style({
          image: new CircleStyle({
            radius: selected ? 10 : 8,
            fill: new Fill({ color: selected ? "#004541" : "#19a69a" }),
            stroke: new Stroke({ color: "#ffffff", width: 3 }),
          }),
        });
      },
    });
    const map = new Map({
      target: targetRef.current,
      layers: [
        new TileLayer({ source: new OSM({ crossOrigin: "anonymous" }) }),
        vectorLayer,
      ],
      view: new View({
        center: fromLonLat([126.8249, 37.2057]),
        zoom: 13,
        minZoom: 6,
        maxZoom: 20,
      }),
      controls: [],
    });
    map.on("click", (event) => {
      const hit = map.forEachFeatureAtPixel(event.pixel, (feature) => feature);
      const caseId = hit?.get("caseId") as string | undefined;
      if (caseId) onCaseSelectRef.current?.(caseId);
      else if (interactiveRef.current) {
        const [longitude, latitude] = toLonLat(event.coordinate);
        onMapClickRef.current?.(longitude, latitude);
      }
    });
    mapRef.current = map;
    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const source = vectorSourceRef.current;
    source.clear();
    const caseFeatures = cases.flatMap((caseRecord) => caseRecord.parcels.slice(0, 1).map((parcel) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([parcel.longitude, parcel.latitude])),
        caseId: caseRecord.id,
        pnu: parcel.pnu,
      });
      return feature;
    }));
    const parcelFeatures = parcels.map((parcel) => new Feature({
      geometry: new Point(fromLonLat([parcel.longitude, parcel.latitude])),
      pnu: parcel.pnu,
    }));
    source.addFeatures([...caseFeatures, ...parcelFeatures]);
    const selected = cases.find((item) => item.id === selectedCaseId)?.parcels[0] ?? parcels.at(-1);
    if (selected) {
      mapRef.current?.getView().animate({
        center: fromLonLat([selected.longitude, selected.latitude]),
        zoom: interactiveRef.current ? 17 : 15,
        duration: 420,
      });
    }
    mapRef.current?.getLayers().changed();
  }, [cases, parcels, selectedCaseId]);

  function zoomBy(delta: number) {
    const view = mapRef.current?.getView();
    if (view) view.animate({ zoom: (view.getZoom() ?? 13) + delta, duration: 180 });
  }

  function useCurrentLocation() {
    navigator.geolocation?.getCurrentPosition((position) => {
      mapRef.current?.getView().animate({
        center: fromLonLat([position.coords.longitude, position.coords.latitude]),
        zoom: 17,
        duration: 450,
      });
    });
  }

  return (
    <div className="parcel-map-shell">
      <div ref={targetRef} className="parcel-map" aria-label="업무 필지 지도" />
      <div className="map-attribution">지도 © OpenStreetMap · 필지정보 VWorld</div>
      <div className="map-controls" aria-label="지도 조작">
        <button type="button" onClick={() => zoomBy(1)} aria-label="확대">+</button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label="축소">−</button>
        <button type="button" onClick={useCurrentLocation} aria-label="현재 위치로 이동">◎</button>
      </div>
      {interactive && <div className="map-hint">지도를 눌러 필지를 확인하세요</div>}
    </div>
  );
}
