import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type ImageTile from "ol/ImageTile";
import TileState from "ol/TileState";
import Point from "ol/geom/Point";
import { createEmpty, extend as extendExtent } from "ol/extent";
import { fromLonLat, toLonLat } from "ol/proj";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";
import type { CaseRecord, ParcelBoundary, ParcelSnapshot } from "../types";
import { lookupParcel, vworldApiUrl, vworldAuthorizedHeaders } from "../services/vworld";

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
  selectedCaseFitPadding?: [number, number, number, number];
  interactive?: boolean;
  focusLocation?: MapFocusLocation | null;
  onMapClick?: (longitude: number, latitude: number) => void;
  onCaseSelect?: (caseId: string) => void;
  onParcelsResolved?: (parcels: ParcelSnapshot[]) => void;
}

interface MapLayerNotice {
  mode: MapMode;
  message: string;
}

const EMPTY_CASES: CaseRecord[] = [];
const EMPTY_PARCELS: ParcelSnapshot[] = [];
const DEFAULT_SELECTED_CASE_FIT_PADDING: [number, number, number, number] = [72, 72, 72, 72];
const geoJson = new GeoJSON();
const normalSelectionStyle = new Style({
  fill: new Fill({ color: "rgba(30, 133, 98, 0.20)" }),
  stroke: new Stroke({ color: "#0b7555", width: 4 }),
});
const imagerySelectionStyle = [
  new Style({ stroke: new Stroke({ color: "rgba(255, 255, 255, 0.96)", width: 9 }) }),
  new Style({
    fill: new Fill({ color: "rgba(245, 29, 118, 0.22)" }),
    stroke: new Stroke({ color: "#f51d76", width: 5 }),
  }),
];

function hasValidParcelLocation(parcel: ParcelSnapshot): boolean {
  return Number.isFinite(parcel.longitude)
    && Number.isFinite(parcel.latitude)
    && parcel.longitude >= -180
    && parcel.longitude <= 180
    && parcel.latitude >= -90
    && parcel.latitude <= 90;
}

function parcelFeature(parcel: ParcelSnapshot, parcelIndex: number) {
  const boundaryGeometry = parcel.boundary
    ? geoJson.readGeometry(parcel.boundary, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      })
    : null;
  const geometry = boundaryGeometry ?? new Point(fromLonLat([parcel.longitude, parcel.latitude]));
  return new Feature({ geometry, pnu: parcel.pnu, parcelIndex });
}

export function ParcelMap({
  cases = EMPTY_CASES,
  parcels = EMPTY_PARCELS,
  selectedCaseId,
  selectedCaseFitPadding = DEFAULT_SELECTED_CASE_FIT_PADDING,
  interactive = false,
  focusLocation = null,
  onMapClick,
  onCaseSelect,
  onParcelsResolved,
}: ParcelMapProps) {
  const [mapMode, setMapMode] = useState<MapMode>(interactive ? "cadastral" : "normal");
  const [layerNotice, setLayerNotice] = useState<MapLayerNotice | null>(null);
  const [resolvedBoundaries, setResolvedBoundaries] = useState<Record<string, ParcelBoundary>>({});
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
  const onParcelsResolvedRef = useRef(onParcelsResolved);
  const mapModeRef = useRef(mapMode);
  const requestedBoundaryPnusRef = useRef(new Set<string>());
  selectedCaseIdRef.current = selectedCaseId;
  interactiveRef.current = interactive;
  onMapClickRef.current = onMapClick;
  onCaseSelectRef.current = onCaseSelect;
  onParcelsResolvedRef.current = onParcelsResolved;
  mapModeRef.current = mapMode;
  const selectedMapCase = cases.find((item) => item.id === selectedCaseId);
  const selectedMapParcel = selectedMapCase?.parcels.find(hasValidParcelLocation);
  const mappableCaseCount = cases.filter((item) => item.parcels.some(hasValidParcelLocation)).length;

  useEffect(() => {
    if (!targetRef.current || mapRef.current) return;
    const target = targetRef.current;
    const baseSource = new XYZ({
      url: "https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png",
      maxZoom: 19,
      crossOrigin: "anonymous",
      attributions: "© VWorld",
    });
    const baseLayer = new TileLayer({
      source: baseSource,
      visible: mapMode === "normal",
    });
    const satelliteSource = new XYZ({
      url: "https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg",
      maxZoom: 19,
      crossOrigin: "anonymous",
      attributions: "© VWorld",
    });
    const satelliteLayer = new TileLayer({
      source: satelliteSource,
      visible: mapMode !== "normal",
    });
    const hybridSource = new XYZ({
      url: "https://xdworld.vworld.kr/2d/Hybrid/service/{z}/{x}/{y}.png",
      maxZoom: 19,
      crossOrigin: "anonymous",
      attributions: "© VWorld",
    });
    const hybridLayer = new TileLayer({
      source: hybridSource,
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
      if (mapModeRef.current === "cadastral") {
        setLayerNotice({ mode: "cadastral", message: "연속지적도를 불러오지 못했습니다. 다시 시도하거나 일반지도로 전환해 주세요." });
      }
    });
    cadastralSource.on("tileloadend", () => setLayerNotice((current) => current?.mode === "cadastral" ? null : current));
    baseSource.on("tileloaderror", () => {
      if (mapModeRef.current === "normal") setLayerNotice({ mode: "normal", message: "일반지도를 불러오지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요." });
    });
    baseSource.on("tileloadend", () => setLayerNotice((current) => current?.mode === "normal" ? null : current));
    satelliteSource.on("tileloaderror", () => {
      const currentMode = mapModeRef.current;
      if (currentMode !== "normal") setLayerNotice({ mode: currentMode, message: "위성 배경지도를 불러오지 못했습니다. 다시 시도하거나 일반지도로 전환해 주세요." });
    });
    hybridSource.on("tileloaderror", () => {
      if (mapModeRef.current === "satellite") setLayerNotice({ mode: "satellite", message: "위성 지도 라벨을 불러오지 못했습니다. 다시 시도해 주세요." });
    });
    const cadastralLayer = new TileLayer({
      source: cadastralSource,
      visible: mapMode === "cadastral",
      opacity: 0.88,
    });
    const vectorLayer = new VectorLayer({
      source: vectorSourceRef.current,
      style: (feature) => {
        const selected = feature.get("caseId") === selectedCaseIdRef.current;
        const geometryType = feature.getGeometry()?.getType();
        if (geometryType === "Polygon" || geometryType === "MultiPolygon") {
          return mapModeRef.current === "normal" ? normalSelectionStyle : imagerySelectionStyle;
        }
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
      target,
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
    let resizeFrame = 0;
    const updateMapSize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        const bounds = target.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        map.updateSize();
        map.renderSync();
      });
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateMapSize);
    resizeObserver?.observe(target);
    window.addEventListener("resize", updateMapSize);
    updateMapSize();
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateMapSize);
      window.cancelAnimationFrame(resizeFrame);
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
    vectorSourceRef.current.changed();
  }, [mapMode]);

  useEffect(() => {
    const selectedCase = cases.find((item) => item.id === selectedCaseId);
    const visibleParcels = selectedCase?.parcels ?? parcels;
    const unresolvedParcels = visibleParcels.filter((parcel) => (
      (!parcel.boundary || parcel.ledgerAreaM2 === undefined || !parcel.category)
      && /^\d{19}$/.test(parcel.pnu)
      && hasValidParcelLocation(parcel)
      && !resolvedBoundaries[parcel.pnu]
      && !requestedBoundaryPnusRef.current.has(parcel.pnu)
    )) ?? [];
    if (!unresolvedParcels.length) return;

    let cancelled = false;
    unresolvedParcels.forEach((parcel) => requestedBoundaryPnusRef.current.add(parcel.pnu));
    void Promise.all(unresolvedParcels.map(async (parcel) => {
      try {
        const resolved = await lookupParcel(parcel.longitude, parcel.latitude, {
          id: parcel.id,
          title: parcel.address,
          address: parcel.address,
          roadAddress: parcel.roadAddress ?? "",
          pnu: parcel.pnu,
          longitude: parcel.longitude,
          latitude: parcel.latitude,
          category: "parcel",
        });
        return resolved;
      } catch {
        requestedBoundaryPnusRef.current.delete(parcel.pnu);
        return null;
      }
    })).then((entries) => {
      if (cancelled) return;
      const resolvedParcels = entries.filter((entry): entry is ParcelSnapshot => Boolean(entry));
      if (!resolvedParcels.length) return;
      const nextBoundaries = Object.fromEntries(resolvedParcels.flatMap((parcel) => (
        parcel.boundary ? [[parcel.pnu, parcel.boundary] as const] : []
      )));
      if (Object.keys(nextBoundaries).length) {
        setResolvedBoundaries((current) => ({ ...current, ...nextBoundaries }));
      }
      onParcelsResolvedRef.current?.(resolvedParcels);
    });

    return () => {
      cancelled = true;
    };
  }, [cases, parcels, resolvedBoundaries, selectedCaseId]);

  useEffect(() => {
    const source = vectorSourceRef.current;
    source.clear();
    const selectedCase = cases.find((item) => item.id === selectedCaseId);
    const caseFeatures = cases.flatMap((caseRecord) => {
      const parcel = caseRecord.parcels.find(hasValidParcelLocation);
      if (!parcel) return [];
      const feature = new Feature({
        geometry: new Point(fromLonLat([parcel.longitude, parcel.latitude])),
        caseId: caseRecord.id,
        pnu: parcel.pnu,
      });
      return [feature];
    });
    const parcelFeatures = parcels.filter(hasValidParcelLocation).map((parcel, index) => {
      const boundary = parcel.boundary ?? resolvedBoundaries[parcel.pnu];
      return parcelFeature(boundary ? { ...parcel, boundary } : parcel, index);
    });
    const selectedParcelFeatures = selectedCase?.parcels.filter(hasValidParcelLocation).map((parcel, index) => {
      const boundary = parcel.boundary ?? resolvedBoundaries[parcel.pnu];
      const feature = parcelFeature(boundary ? { ...parcel, boundary } : parcel, index);
      feature.set("caseId", selectedCase.id);
      return feature;
    }) ?? [];
    source.addFeatures([...caseFeatures, ...selectedParcelFeatures, ...parcelFeatures]);

    const focusedParcelFeatures = selectedParcelFeatures.length
      ? selectedParcelFeatures
      : parcelFeatures.length
        ? parcelFeatures
        : caseFeatures;
    if (focusedParcelFeatures.length) {
      if (interactiveRef.current) setMapMode("cadastral");
      const selectedExtent = createEmpty();
      focusedParcelFeatures.forEach((feature) => {
        const geometry = feature.getGeometry();
        if (geometry) extendExtent(selectedExtent, geometry.getExtent());
      });
      mapRef.current?.getView().fit(selectedExtent, {
        padding: selectedCaseFitPadding,
        maxZoom: 18,
        duration: 500,
      });
    } else {
      mapRef.current?.getLayers().changed();
      return;
    }
    mapRef.current?.getLayers().changed();
  }, [cases, parcels, resolvedBoundaries, selectedCaseId, selectedCaseFitPadding]);

  useEffect(() => {
    if (!focusLocation) return;
    if (interactiveRef.current) setMapMode("cadastral");
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

  function selectMapMode(mode: MapMode) {
    setLayerNotice(null);
    setMapMode(mode);
    window.requestAnimationFrame(() => {
      mapRef.current?.updateSize();
      mapRef.current?.renderSync();
    });
  }

  function retryVisibleLayer() {
    setLayerNotice(null);
    if (mapMode === "normal") baseLayerRef.current?.getSource()?.refresh();
    else {
      satelliteLayerRef.current?.getSource()?.refresh();
      if (mapMode === "satellite") hybridLayerRef.current?.getSource()?.refresh();
      if (mapMode === "cadastral") cadastralLayerRef.current?.getSource()?.refresh();
    }
    mapRef.current?.updateSize();
    mapRef.current?.renderSync();
  }

  return (
    <div className="parcel-map-shell">
      <div ref={targetRef} className="parcel-map" aria-label="업무 필지 지도" />
      {cases.length > 0 && (
        <div className="map-context-card" aria-live="polite">
          <strong>{selectedMapCase ? selectedMapCase.title : `${mappableCaseCount}개 업무 위치`}</strong>
          <span>{selectedMapCase
            ? selectedMapParcel?.address ?? "지도 위치를 확인해야 하는 업무입니다."
            : mappableCaseCount === cases.length
              ? "마커를 누르면 업무 상세를 확인할 수 있습니다."
              : `${cases.length - mappableCaseCount}개 업무는 지도 위치 확인이 필요합니다.`}</span>
        </div>
      )}
      <div className="map-attribution">지도·연속지적도 © VWorld · 참고용</div>
      <div className="map-layer-switch" aria-label="지도 유형">
        {(["normal", "satellite", "cadastral"] as const).map((mode) => (
          <button
            type="button"
            className={mapMode === mode ? "active" : ""}
            aria-pressed={mapMode === mode}
            onClick={() => selectMapMode(mode)}
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
      {layerNotice && <div className="map-layer-notice" role="status"><span>{layerNotice.message}</span><div><button type="button" onClick={retryVisibleLayer}>다시 시도</button>{mapMode !== "normal" && <button type="button" onClick={() => selectMapMode("normal")}>일반지도 보기</button>}</div></div>}
      {interactive && <div className="map-hint">지도를 눌러 필지를 확인하세요</div>}
    </div>
  );
}
