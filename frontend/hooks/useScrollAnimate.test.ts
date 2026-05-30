import { renderHook, waitFor } from "@testing-library/react";
import { useScrollAnimate } from "./useScrollAnimate";

describe("useScrollAnimate", () => {
  let matchMediaMock: jest.SpyInstance;

  beforeEach(() => {
    matchMediaMock = jest.spyOn(window, "matchMedia");
  });

  afterEach(() => {
    matchMediaMock.mockRestore();
  });

  it("should return visible=true immediately when prefers-reduced-motion is set", () => {
    matchMediaMock.mockReturnValueOnce({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as MediaQueryList);

    const { result } = renderHook(() => useScrollAnimate());

    expect(result.current.visible).toBe(true);
    expect(result.current.ref).toBeDefined();
  });

  it("should return visible=false initially when prefers-reduced-motion is not set", () => {
    matchMediaMock.mockReturnValueOnce({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as MediaQueryList);

    const mockIntersectionObserver = jest.fn();
    global.IntersectionObserver = mockIntersectionObserver as any;

    const { result } = renderHook(() => useScrollAnimate());

    expect(result.current.visible).toBe(false);
    expect(mockIntersectionObserver).toHaveBeenCalled();
  });

  it("should trigger visible=true when IntersectionObserver detects intersection", async () => {
    let intersectionCallback: IntersectionObserverCallback;

    matchMediaMock.mockReturnValueOnce({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as MediaQueryList);

    const mockIntersectionObserver = jest.fn((callback) => {
      intersectionCallback = callback;
      return {
        observe: jest.fn(),
        disconnect: jest.fn(),
        unobserve: jest.fn(),
      };
    });

    global.IntersectionObserver = mockIntersectionObserver as any;

    const { result, rerender } = renderHook(() => useScrollAnimate());

    expect(result.current.visible).toBe(false);

    intersectionCallback!(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
  });

  it("should return visible=true when IntersectionObserver is not available", () => {
    const originalIntersectionObserver = global.IntersectionObserver;
    delete (global as any).IntersectionObserver;

    matchMediaMock.mockReturnValueOnce({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as MediaQueryList);

    const { result } = renderHook(() => useScrollAnimate());

    expect(result.current.visible).toBe(true);

    (global as any).IntersectionObserver = originalIntersectionObserver;
  });

  it("should disconnect observer on unmount", () => {
    const disconnectMock = jest.fn();

    matchMediaMock.mockReturnValueOnce({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as MediaQueryList);

    const mockIntersectionObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: disconnectMock,
      unobserve: jest.fn(),
    }));

    global.IntersectionObserver = mockIntersectionObserver as any;

    const { unmount } = renderHook(() => useScrollAnimate());

    unmount();

    expect(disconnectMock).toHaveBeenCalled();
  });

  it("should respect threshold parameter", () => {
    const observeMock = jest.fn();

    matchMediaMock.mockReturnValueOnce({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as MediaQueryList);

    const mockIntersectionObserver = jest.fn(() => ({
      observe: observeMock,
      disconnect: jest.fn(),
      unobserve: jest.fn(),
    }));

    global.IntersectionObserver = mockIntersectionObserver as any;

    const { result } = renderHook(() => useScrollAnimate(0.5));

    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      { threshold: 0.5 },
    );
  });
});
