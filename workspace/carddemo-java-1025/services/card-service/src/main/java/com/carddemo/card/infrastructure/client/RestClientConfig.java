package com.carddemo.card.infrastructure.client;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/** 下游调用客户端（customer / transaction），超时 3 秒。 */
@Configuration
public class RestClientConfig {

    @Bean
    public RestClient customerRestClient(RestClient.Builder builder,
                                         @Value("${client.customer-service.base-url}") String baseUrl,
                                         @Value("${client.connect-timeout:3s}") Duration connectTimeout,
                                         @Value("${client.read-timeout:3s}") Duration readTimeout) {
        return build(builder, baseUrl, connectTimeout, readTimeout);
    }

    @Bean
    public RestClient transactionRestClient(RestClient.Builder builder,
                                            @Value("${client.transaction-service.base-url}") String baseUrl,
                                            @Value("${client.connect-timeout:3s}") Duration connectTimeout,
                                            @Value("${client.read-timeout:3s}") Duration readTimeout) {
        return build(builder, baseUrl, connectTimeout, readTimeout);
    }

    private static RestClient build(RestClient.Builder builder, String baseUrl,
                                    Duration connectTimeout, Duration readTimeout) {
        ClientHttpRequestFactorySettings settings = ClientHttpRequestFactorySettings.DEFAULTS
                .withConnectTimeout(connectTimeout)
                .withReadTimeout(readTimeout);
        return builder.baseUrl(baseUrl)
                .requestFactory(ClientHttpRequestFactories.get(settings))
                .build();
    }
}
