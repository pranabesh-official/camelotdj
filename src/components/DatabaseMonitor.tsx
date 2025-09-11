import React, { useState, useEffect, useCallback } from 'react';
import { RobustDatabaseService } from '../services/RobustDatabaseService';
import './DatabaseMonitor.css';

interface DatabaseMonitorProps {
  databaseService: RobustDatabaseService;
  isVisible: boolean;
  onClose: () => void;
}

interface HealthMetrics {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  errorRate: number;
  successRate: number;
  totalOperations: number;
  averageResponseTime: number;
  consecutiveFailures: number;
}

interface OperationMetrics {
  pending: number;
  success: number;
  failed: number;
  retrying: number;
}

const DatabaseMonitor: React.FC<DatabaseMonitorProps> = ({ 
  databaseService, 
  isVisible, 
  onClose 
}) => {
  const [healthMetrics, setHealthMetrics] = useState<HealthMetrics | null>(null);
  const [operationMetrics, setOperationMetrics] = useState<OperationMetrics | null>(null);
  const [operationQueue, setOperationQueue] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refreshData = useCallback(async () => {
    if (!databaseService) return;
    
    setIsRefreshing(true);
    try {
      const metrics = databaseService.getMetrics();
      const queue = databaseService.getOperationQueue();
      
      setHealthMetrics({
        status: metrics.isHealthy ? 'healthy' : 'unhealthy',
        responseTime: metrics.averageResponseTime,
        errorRate: metrics.errorRate,
        successRate: metrics.successRate,
        totalOperations: metrics.totalOperations,
        averageResponseTime: metrics.averageResponseTime,
        consecutiveFailures: metrics.consecutiveFailures
      });
      
      // Calculate operation metrics from queue
      const opMetrics: OperationMetrics = {
        pending: queue.filter(op => op.status === 'pending').length,
        success: queue.filter(op => op.status === 'success').length,
        failed: queue.filter(op => op.status === 'failed').length,
        retrying: queue.filter(op => op.status === 'retrying').length
      };
      setOperationMetrics(opMetrics);
      setOperationQueue(queue);
    } catch (error) {
      console.error('Failed to refresh database monitor data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [databaseService]);

  useEffect(() => {
    if (isVisible && databaseService) {
      refreshData();
      
      if (autoRefresh) {
        const interval = setInterval(refreshData, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
      }
    }
  }, [isVisible, databaseService, autoRefresh, refreshData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#10B981';
      case 'degraded': return '#F59E0B';
      case 'unhealthy': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✅';
      case 'degraded': return '⚠️';
      case 'unhealthy': return '❌';
      default: return '❓';
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (!isVisible) return null;

  return (
    <div className="database-monitor-overlay">
      <div className="database-monitor-modal">
        <div className="database-monitor-header">
          <h2>Database Monitor</h2>
          <div className="database-monitor-controls">
            <label className="auto-refresh-toggle">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto Refresh
            </label>
            <button 
              className="refresh-btn"
              onClick={refreshData}
              disabled={isRefreshing}
            >
              {isRefreshing ? '🔄' : '↻'} Refresh
            </button>
            <button className="close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="database-monitor-content">
          {/* Health Status */}
          <div className="monitor-section">
            <h3>Health Status</h3>
            {healthMetrics ? (
              <div className="health-grid">
                <div className="health-item">
                  <span className="health-label">Status:</span>
                  <span 
                    className="health-value"
                    style={{ color: getStatusColor(healthMetrics.status) }}
                  >
                    {getStatusIcon(healthMetrics.status)} {healthMetrics.status.toUpperCase()}
                  </span>
                </div>
                <div className="health-item">
                  <span className="health-label">Response Time:</span>
                  <span className="health-value">
                    {formatDuration(healthMetrics.responseTime)}
                  </span>
                </div>
                <div className="health-item">
                  <span className="health-label">Success Rate:</span>
                  <span className="health-value">
                    {(healthMetrics.successRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="health-item">
                  <span className="health-label">Error Rate:</span>
                  <span className="health-value">
                    {(healthMetrics.errorRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="health-item">
                  <span className="health-label">Total Operations:</span>
                  <span className="health-value">
                    {healthMetrics.totalOperations}
                  </span>
                </div>
                <div className="health-item">
                  <span className="health-label">Consecutive Failures:</span>
                  <span className="health-value">
                    {healthMetrics.consecutiveFailures}
                  </span>
                </div>
              </div>
            ) : (
              <div className="loading">Loading health data...</div>
            )}
          </div>

          {/* Operation Metrics */}
          <div className="monitor-section">
            <h3>Operation Metrics</h3>
            {operationMetrics ? (
              <div className="operation-grid">
                <div className="operation-item pending">
                  <span className="operation-count">{operationMetrics.pending}</span>
                  <span className="operation-label">Pending</span>
                </div>
                <div className="operation-item success">
                  <span className="operation-count">{operationMetrics.success}</span>
                  <span className="operation-label">Success</span>
                </div>
                <div className="operation-item failed">
                  <span className="operation-count">{operationMetrics.failed}</span>
                  <span className="operation-label">Failed</span>
                </div>
                <div className="operation-item retrying">
                  <span className="operation-count">{operationMetrics.retrying}</span>
                  <span className="operation-label">Retrying</span>
                </div>
              </div>
            ) : (
              <div className="loading">Loading operation data...</div>
            )}
          </div>

          {/* Operation Queue */}
          <div className="monitor-section">
            <h3>Operation Queue ({operationQueue.length})</h3>
            <div className="operation-queue">
              {operationQueue.length > 0 ? (
                <div className="queue-table">
                  <div className="queue-header">
                    <span>ID</span>
                    <span>Type</span>
                    <span>Endpoint</span>
                    <span>Status</span>
                    <span>Retries</span>
                    <span>Time</span>
                  </div>
                  {operationQueue.slice(0, 10).map((op) => (
                    <div key={op.id} className="queue-row">
                      <span className="queue-id">{op.id.slice(-8)}</span>
                      <span className="queue-type">{op.type}</span>
                      <span className="queue-endpoint">{op.endpoint}</span>
                      <span 
                        className={`queue-status ${op.status}`}
                        style={{ color: getStatusColor(op.status) }}
                      >
                        {op.status}
                      </span>
                      <span className="queue-retries">{op.retryCount}</span>
                      <span className="queue-time">{formatTime(op.timestamp)}</span>
                    </div>
                  ))}
                  {operationQueue.length > 10 && (
                    <div className="queue-more">
                      ... and {operationQueue.length - 10} more operations
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-queue">No operations in queue</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseMonitor;
