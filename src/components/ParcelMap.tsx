import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import type ImageTile from "ol/ImageTile";
import TileState from "ol/TileState";
import Point from "ol/geom/Point";
import { fromLonLat, toLonLat } from "ol/proj";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";
import type { CaseRecord, ParcelSnapshot } from "../types";
import { vworldApiUrl, vworldAuthorizedHeaders } from "../services/vworld";

type MapMode = "normal" | "satellite" | "cadastral";

interface MapFocusLocation {
  longitude: number;
  latitude: number;
  requestId: number;
}

interface ParcelMapProps {
  cases?: CaseRecord[];
  parcels?: ParcelSnapshot[];
  selectedCaseId?: string | null;
  interactive?: boolean;
  focusLocation?: MapFocusLocation | null;
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
  focusLocation = null,
  onMapClick,
  onCaseSelect,
}: ParcelMapProps) {
  const [mapMode, setMapMode] = useState<MapMode>(interactive ? "cadastral" : "normal");
  const [layerMessage, setLayerMessage] = useState("");
  const targetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef(new VectorSource());
  const baseLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const satelliteLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const hybridLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const cadastralLayerRef = useRef<TileLayer<TileWMS> | null>(null);
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
    const baseLayer = new TileLayer({
      source: new XYZ({
        url: "https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png",
        maxZoom: 19,
        crossOrigin: "anonymous",
        attributions: "© VWorld",
      }),
      visible: mapMode === "normal",
    });
    const satelliteLayer = new TileLayer({
      source: new XYZ({
        url: "https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg",
        maxZoom: 19,
        crossOrigin: "anonymous",
        attributions: "© VWorld",
      }),
      visible: mapMode !== "normal",
    });
    const hybridLayer = new TileLayer({
      source: new XYZ({
        url: "https://xdworld.vworld.kr/2d/Hybrid/service/{z}/{x}/{y}.png",
        maxZoom: 19,
        crossOrigin: "anonymous",
        attributions: "© VWorld",
      }),
      visible: mapMode === "satellite",
    });
    const cadastralSource = new TileWMS({
      url: vworldApiUrl("/vworld/wms"),
      params: {
        LAYERS: "lp_pa_cbnd_bonbun,lp_pa_cbnd_bubun",
        STYLES: "lp_pa_cbnd_bonbun,lp_pa_cbnd_bubun",
        FORMAT: "image/png",
        TRANSPARENT: true,
        VERSION: "1.3.0",
      },
      tileLoadFunction: (tile, source) => {
        void (async () => {
          try {
            const response = await fetch(source, { headers: await vworldAuthorizedHeaders() });
            if (!response.ok) throw new Error(String(response.status));
            const image = (tile as ImageTile).getImage();
            if (!(image instanceof HTMLImageElement)) throw new Error("지원하지 않는 지도 타일입니다.");
            const objectUrl = URL.createObjectURL(await response.blob());
            const releaseObjectUrl = () => URL.revokeObjectURL(objectUrl);
            image.addEventListener("load", releaseObjectUrl, { once: true });
            image.addEventListener("error", releaseObjectUrl, { once: true });
            image.src = objectUrl;
          } catch {
            tile.setState(TileState.ERROR);
          }
        })();
      },
      transition: 0,
    });
    cadastralSource.on("tileloaderror", () => {
      setLayerMessage("연속지적도를 불러오지 못했습니다. 로그인 상태와 VWorld 연결을 확인해 주세요.");
    });
    cadastralSource.on("tileloadend", () => setLayerMessage(""));
    const cadastralLayer = new TileLayer({
      source: cadastralSource,
      visible: mapMode === "cadastral",
      opacity: 0.88,
    });
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
        baseLayer,
        satelliteLayer,
        hybridLayer,
        cadastralLayer,
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
    baseLayerRef.current = baseLayer;
    satelliteLayerRef.current = satelliteLayer;
    hybridLayerRef.current = hybridLayer;
    cadastralLayerRef.current = cadastralLayer;
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
      baseLayerRef.current = null;
      satelliteLayerRef.current = null;
      hybridLayerRef.current = null;
      cadastralLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    baseLayerRef.current?.setVisible(mapMode === "normal");
    satelliteLayerRef.current?.setVisible(mapMode !== "normal");
    hybridLayerRef.current?.setVisible(mapMode === "satellite");
    cadastralLayerRef.current?.setVisible(mapMode === "cadastral");
  }, [mapMode]);

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

  useEffect(() => {
    if (!focusLocation) return;
    setMapMode("cadastral");
    mapRef.current?.getView().animate({
      center: fromLonLat([focusLocation.longitude, focusLocation.latitude]),
      zoom: 18,
      duration: 500,
    });
  }, [focusLocation]);

  function zoomBy(delta: number) {
    const view = mapRef.current?.getView();
    if (view) view.animate({ zoom: (view.getZoom() ?? 13) + delta, duration: 180 });
  }

  return (
    <div className="parcel-map-shell">
      <div ref={targetRef} className="parcel-map" aria-label="업무 필지 지도" />
      <div className="map-attribution">지도·연속지적도 © VWorld · 참고용</div>
      <div className="map-layer-switch" aria-label="지도 유형">
        {(["normal", "satellite", "cadastral"] as const).map((mode) => (
          <button
            type="button"
            className={mapMode === mode ? "active" : ""}
            aria-pressed={mapMode === mode}
            onClick={() => setMapMode(mode)}
            key={mode}
          >
            {mode === "normal" ? "일반" : mode === "satellite" ? "위성" : "지적도"}
          </button>
        ))}
      </div>
      <div className="map-controls" aria-label="지도 조작">
        <button type="button" onClick={() => zoomBy(1)} aria-label="확대">+</button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label="축소">−</button>
      </div>
      {layerMessage && <div className="map-layer-notice" role="status">{layerMessage}</div>}
      {interactive && <div className="map-hint">지도를 눌러 필지를 확인하세요</div>}
    </div>
  );
}
