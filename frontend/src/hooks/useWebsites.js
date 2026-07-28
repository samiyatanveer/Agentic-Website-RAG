import { useCallback, useEffect, useState } from 'react';
import { getWebsites } from '../services/websiteService';

export function useWebsites() {
  const [websites, setWebsites] = useState([]);
  const [selectedWebsite, setSelectedWebsite] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshWebsites = useCallback(async () => {
    try {
      const nextWebsites = await getWebsites();
      setWebsites(nextWebsites);
      setError(null);
      return nextWebsites;
    } catch (requestError) {
      setWebsites([]);
      setError(requestError.message || 'Unable to load websites.');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWebsites();
  }, [refreshWebsites]);

  useEffect(() => {
    setSelectedWebsite((current) => {
      if (!current) return current;
      return websites.find((website) => website.id === current.id) ?? current;
    });
  }, [websites]);

  const selectScrapedWebsite = useCallback(async (websiteId) => {
    const nextWebsites = await refreshWebsites();
    const scrapedWebsite = nextWebsites.find((website) => website.id === websiteId);
    if (scrapedWebsite) setSelectedWebsite(scrapedWebsite);
  }, [refreshWebsites]);

  return {
    websites,
    selectedWebsite,
    isLoading,
    error,
    refreshWebsites,
    setSelectedWebsite,
    selectScrapedWebsite,
  };
}
